import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import App from "@/App.jsx";
import "@/index.css";
const isDev = import.meta.env.DEV;
const REACTWRAP = isDev ? React.Fragment : React.StrictMode;

ReactDOM.createRoot(document.getElementById("root")).render(
  <REACTWRAP>
    <Router>
      <App />
    </Router>
  </REACTWRAP>
);
