import React from "react";
import { createRoot } from "react-dom/client";
import { Studio } from "./studio";
import "@excalidraw/excalidraw/index.css";
import "./studio.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing app root.");
createRoot(root).render(<Studio />);
