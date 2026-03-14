import { initUiMain } from "./ui_init_main.js";
import { refreshUiMain } from "./ui_refresh_main.js";

export function createToolRegistry() {
  return [
    { id: "select", label: "Select" },
    { id: "vertex", label: "Vertex" },
    { id: "line", label: "Line" },
    { id: "polyline", label: "Polyline" },
    { id: "rect", label: "Rect" },
    { id: "circle", label: "Circle" },
    { id: "position", label: "Position" },
    { id: "text", label: "Text" },
    { id: "dim", label: "Dim" },
    { id: "trim", label: "Trim" },
    { id: "fillet", label: "Fillet" },
    { id: "hatch", label: "Hatch" },
    { id: "doubleline", label: "Double Line" },
  ];
}

export function initUi(state, dom, actions) {
  return initUiMain(state, dom, actions, {
    createToolRegistry,
  });
}

export function refreshUi(state, dom) {
  return refreshUiMain(state, dom);
}