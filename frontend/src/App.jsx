import { BrowserRouter, Routes, Route } from "react-router-dom";

import Giris from "./pages/Giris.jsx";
import Kayit from "./pages/Kayit.jsx";
import SifremiUnuttum from "./pages/SifremiUnuttum.jsx";

import PanelLayout from "./components/PanelLayout.jsx";
import KontrolPaneli from "./pages/KontrolPaneli.jsx";
import Derslerim from "./pages/Derslerim.jsx";
import CalismaPlani from "./pages/CalismaPlani.jsx";
import Ilerleme from "./pages/Ilerleme.jsx";
import Profil from "./pages/Profil.jsx";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Kimlik Doğrulama */}
                <Route path="/" element={<Giris />} />
                <Route path="/kayit" element={<Kayit />} />
                <Route
                    path="/sifremi-unuttum"
                    element={<SifremiUnuttum />}
                />

                {/* Uygulama */}
                <Route path="/panel" element={<PanelLayout />}>
                    <Route index element={<KontrolPaneli />} />
                    <Route path="dersler" element={<Derslerim />} />
                    <Route path="calisma-plani" element={<CalismaPlani />} />
                    <Route path="ilerleme" element={<Ilerleme />} />
                    <Route path="profil" element={<Profil />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;