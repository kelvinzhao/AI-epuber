import { HashRouter, Routes, Route } from "react-router-dom";
import Bookshelf from "./pages/Bookshelf";
import Reader from "./pages/Reader";
import Settings from "./pages/Settings";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Bookshelf />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/reader/:id/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
}

export default App;