// Login and registration screen for JobTrackr
import React, { useState } from "react";
import {
  Box,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
  Paper,
  CssBaseline,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { WorkOutline as WorkIcon } from "@mui/icons-material";
import { login, register } from "./api";

// Dark theme for the login page
var loginTheme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#09090b", paper: "#111114" },
    primary: { main: "#5b9dff" },
    text: { primary: "#ededef", secondary: "#8b8d98" },
    divider: "rgba(255, 255, 255, 0.06)",
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: {
      borderRadius: 8, textTransform: "none", fontWeight: 600, fontSize: "0.875rem",
      boxShadow: "none", "&:hover": { boxShadow: "none" },
    } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
});

// Login/Register screen shown when the user is not authenticated
function Login(props) {
  // onLogin is the callback to call after successful login/register
  var onLogin = props.onLogin;

  // isRegister controls whether we show the register form or the login form
  var _isRegisterState = useState(false);
  var isRegister = _isRegisterState[0];
  var setIsRegister = _isRegisterState[1];

  // Form field state
  var _emailState = useState("");
  var email = _emailState[0];
  var setEmail = _emailState[1];

  var _passwordState = useState("");
  var password = _passwordState[0];
  var setPassword = _passwordState[1];

  var _nameState = useState("");
  var name = _nameState[0];
  var setName = _nameState[1];

  // error holds any error message to display
  var _errorState = useState("");
  var error = _errorState[0];
  var setError = _errorState[1];

  // loading prevents double-submit while a request is in flight
  var _loadingState = useState(false);
  var loading = _loadingState[0];
  var setLoading = _loadingState[1];

  // Handles form submission for both login and register
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    var result;
    if (isRegister) {
      if (!name.trim()) {
        setError("Name is required.");
        setLoading(false);
        return;
      }
      result = await register(email.trim(), password, name.trim());
    } else {
      result = await login(email.trim(), password);
    }

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // Pass the user data up to App so it can show the dashboard
    onLogin(result.user);
  }

  // Switches between login and register mode
  function toggleMode() {
    setIsRegister(!isRegister);
    setError("");
  }

  return (
    <ThemeProvider theme={loginTheme}>
      <CssBaseline />
      <Box sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #09090b 0%, #111827 50%, #09090b 100%)",
      }}>
        <Paper elevation={0} sx={{
          width: "100%",
          maxWidth: 400,
          p: 4,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
        }}>
          {/* Brand header */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: 2,
              background: "linear-gradient(135deg, #5b9dff, #a78bfa)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <WorkIcon sx={{ fontSize: 20, color: "#fff" }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.25rem", color: "text.primary" }}>
              JobTrackr
            </Typography>
          </Stack>

          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mb: 3 }}>
            {isRegister ? "Create an account to start tracking" : "Sign in to your account"}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: "0.8125rem" }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {isRegister && (
                <TextField
                  label="Name"
                  value={name}
                  onChange={function (e) { setName(e.target.value); }}
                  required
                  fullWidth
                  size="small"
                  sx={{ "& .MuiOutlinedInput-root": { bgcolor: "rgba(255,255,255,0.03)" } }}
                />
              )}

              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={function (e) { setEmail(e.target.value); }}
                required
                fullWidth
                size="small"
                sx={{ "& .MuiOutlinedInput-root": { bgcolor: "rgba(255,255,255,0.03)" } }}
              />

              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={function (e) { setPassword(e.target.value); }}
                required
                fullWidth
                size="small"
                inputProps={{ minLength: 6 }}
                sx={{ "& .MuiOutlinedInput-root": { bgcolor: "rgba(255,255,255,0.03)" } }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                sx={{
                  py: 1.25,
                  background: "linear-gradient(135deg, #5b9dff, #7c3aed)",
                  "&:hover": { opacity: 0.9 },
                  "&:disabled": { opacity: 0.6 },
                }}
              >
                {loading
                  ? "Please wait..."
                  : (isRegister ? "Create Account" : "Sign In")
                }
              </Button>
            </Stack>
          </form>

          <Box sx={{ textAlign: "center", mt: 2.5 }}>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
              {isRegister ? "Already have an account?" : "Don't have an account?"}
              {" "}
              <Typography
                component="span"
                onClick={toggleMode}
                sx={{
                  color: "#5b9dff",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {isRegister ? "Sign in" : "Create one"}
              </Typography>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}

export default Login;
