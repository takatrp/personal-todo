import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { TodoApp } from "../app/todo-app";

const root = document.getElementById("root");

if (!root) {
  throw new Error("アプリの表示先が見つかりません。");
}

createRoot(root).render(
  <StrictMode>
    <TodoApp />
  </StrictMode>,
);
