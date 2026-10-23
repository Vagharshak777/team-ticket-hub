import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@clr/ui/clr-ui.min.css";
import "./style.css";

// Start the React app.
createRoot(document.getElementById("root")).render(<App />);
