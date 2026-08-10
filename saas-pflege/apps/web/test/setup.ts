import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Zwischen zwei Tests das DOM leeren: sonst fände eine Abfrage im zweiten Test
// noch die Knöpfe des ersten und schlüge mit "found multiple elements" fehl.
afterEach(cleanup);
