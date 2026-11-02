import { RouterProvider } from "react-router";
import { roteador } from "./rotas";

export function App() {
  return <RouterProvider router={roteador} />;
}
