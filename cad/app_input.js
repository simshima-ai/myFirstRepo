import {
    panByScreenDelta, zoomAt, getMouseScreen, getMouseWorld
} from "./app_input_coords.js";

/**
 * Input & Event Logic extracted from app.js
 */

export { panByScreenDelta, zoomAt, getMouseScreen, getMouseWorld };
import { setupInputListenersImpl } from "./app_input_setup.js";

export function setupInputListeners(state, dom, helpers) {
    return setupInputListenersImpl(state, dom, helpers);
}
