from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job
from ..schemas import JobCreate, JobResponse, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


async def _get_job_or_404(db: AsyncSession, job_id: int) -> Job:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db)):
    job = Job(**payload.model_dump(exclude_none=True))
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("", response_model=list[JobResponse])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Job).where(Job.is_deleted == False).order_by(Job.id.desc())  # noqa: E712
    )
    return result.scalars().all()


# ── Trash endpoints (must be before /{job_id} routes) ────────────────────────

@router.get("/trash", response_model=list[JobResponse])
async def list_trash(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Job).where(Job.is_deleted == True).order_by(Job.deleted_at.desc())  # noqa: E712
    )
    return result.scalars().all()


# ── Job-specific endpoints ───────────────────────────────────────────────────

@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(job_id: int, payload: JobUpdate, db: AsyncSession = Depends(get_db)):
    job = await _get_job_or_404(db, job_id)
    if job.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot update a deleted job")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(job, field, value)
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Soft-delete a job (moves it to trash)."""
    job = await _get_job_or_404(db, job_id)
    if job.is_deleted:
        raise HTTPException(status_code=400, detail="Job is already deleted")
    job.is_deleted = True
    job.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/{job_id}/restore", response_model=JobResponse)
async def restore_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await _get_job_or_404(db, job_id)
    if not job.is_deleted:
        raise HTTPException(status_code=400, detail="Job is not deleted")
    job.is_deleted = False
    job.deleted_at = None
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/trash/all", status_code=204)
async def empty_trash(db: AsyncSession = Depends(get_db)):
    """Permanently delete ALL trashed jobs."""
    result = await db.execute(select(Job).where(Job.is_deleted == True))  # noqa: E712
    for job in result.scalars().all():
        await db.delete(job)
    await db.commit()


@router.delete("/trash/batch", status_code=204)
async def batch_permanent_delete(ids: list[int], db: AsyncSession = Depends(get_db)):
    """Permanently delete selected trashed jobs by ID list."""
    for job_id in ids:
        job = await db.get(Job, job_id)
        if job and job.is_deleted:
            await db.delete(job)
    await db.commit()


@router.post("/trash/restore-batch", response_model=list[JobResponse])
async def batch_restore(ids: list[int], db: AsyncSession = Depends(get_db)):
    """Restore selected trashed jobs by ID list."""
    restored = []
    for job_id in ids:
        job = await db.get(Job, job_id)
        if job and job.is_deleted:
            job.is_deleted = False
            job.deleted_at = None
            restored.append(job)
    await db.commit()
    for job in restored:
        await db.refresh(job)
    return restored


@router.post("/batch-delete", status_code=204)
async def batch_soft_delete(ids: list[int], db: AsyncSession = Depends(get_db)):
    """Soft-delete multiple jobs at once (move to trash)."""
    for job_id in ids:
        job = await db.get(Job, job_id)
        if job and not job.is_deleted:
            job.is_deleted = True
            job.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.delete("/{job_id}/permanent", status_code=204)
async def permanent_delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Permanently remove a job from the database. Only works on already-trashed jobs."""
    job = await _get_job_or_404(db, job_id)
    if not job.is_deleted:
        raise HTTPException(status_code=400, detail="Job must be in trash before permanent deletion")
    await db.delete(job)
    await db.commit()
