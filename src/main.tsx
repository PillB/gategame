import { createRoot } from "react-dom/client";
import Gateflow from "../app/page";
import "./fonts.css";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Gateflow mount point #root was not found");

createRoot(root).render(<Gateflow />);
