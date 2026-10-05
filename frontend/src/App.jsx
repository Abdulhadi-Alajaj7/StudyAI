import { BrowserRouter, Routes, Route } from "react-router-dom";

import Giris from "./pages/Giris.jsx";
import Kayit from "./pages/Kayit.jsx";
import SifremiUnuttum from "./pages/SifremiUnuttum.jsx";

import PanelLayout from "./components/PanelLayout.jsx";
import KorumaliRoute from "./components/KorumaliRoute.jsx";

import KontrolPaneli from "./pages/KontrolPaneli.jsx";
import Derslerim from "./pages/Derslerim.jsx";
import CalismaPlani from "./pages/CalismaPlani.jsx";
import Ilerleme from "./pages/Ilerleme.jsx";
import Profil from "./pages/Profil.jsx";
import Yanlislarim from "./pages/Yanlislarim.jsx";
import Sinavlarim from "./pages/Sinavlarim.jsx";

function App() {
    return (
        <BrowserRouter>
            <Routes>

                {/* Kimlik Doğrulama */}
                <Route path="/" element={<Giris />} />

                <Route
                    path="/kayit"
                    element={<Kayit />}
                />

                <Route
                    path="/sifremi-unuttum"
                    element={<SifremiUnuttum />}
                />

                {/* Korumalı Sayfalar */}
                <Route element={<KorumaliRoute />}>

                    <Route
                        path="/panel"
                        element={<PanelLayout />}
                    >
                        <Route
                            index
                            element={<KontrolPaneli />}
                        />

                        <Route
                            path="dersler"
                            element={<Derslerim />}
                        />

                        <Route
                            path="calisma-plani"
                            element={<CalismaPlani />}
                        />

                        <Route
                            path="yanlislarim"
                            element={<Yanlislarim />}
                        />

                        <Route
                            path="sinavlarim"
                            element={<Sinavlarim />}
                        />

                        <Route
                            path="ilerleme"
                            element={<Ilerleme />}
                        />

                        <Route
                            path="profil"
                            element={<Profil />}
                        />
                    </Route>

                </Route>

            </Routes>
        </BrowserRouter>
    );
}

export default App;