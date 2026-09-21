import React from "react";
import ReactDOM from "react-dom/client";
import { Prompt } from "./Prompt.js";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Prompt />
    </React.StrictMode>
  );
}
