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

import YeniDersOlustur from "./pages/YeniDersOlustur.jsx";
import MateryalEkle from "./pages/MateryalEkle.jsx";
import DersHazir from "./pages/DersHazir.jsx";
import DersGenelBakis from "./pages/DersGenelBakis.jsx";
import DersKonular from "./pages/DersKonular.jsx";
import DersOzet from "./pages/DersOzet.jsx";
import DersSohbet from "./pages/DersSohbet.jsx";
import DersTestler from "./pages/DersTestler.jsx";
import TestCoz from "./pages/TestCoz.jsx";
import TestSonucu from "./pages/TestSonucu.jsx";
import DersCalismaKartlari from "./pages/DersCalismaKartlari.jsx";
import DersDuzenle from "./pages/DersDuzenle.jsx";

import DersAdimScroll from "./components/DersAdimScroll.jsx";
import DersDetayLayout from "./components/DersDetayLayout.jsx";
function App() {
    return (
        <BrowserRouter>
        <DersAdimScroll />
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
                    <Route element={<PanelLayout />}>
                        <Route path="/panel">
                            <Route index element={<KontrolPaneli />} />
                            <Route path="dersler" element={<Derslerim />} />
                            <Route path="dersler/yeni" element={<YeniDersOlustur />} />
                            <Route path="dersler/:dersId/materyal" element={<MateryalEkle />} />
                            <Route path="dersler/:dersId/hazir" element={<DersHazir />} />
                            <Route path="calisma-plani" element={<CalismaPlani />} />
                            <Route path="yanlislarim" element={<Yanlislarim />} />
                            <Route path="sinavlarim" element={<Sinavlarim />} />
                            <Route path="ilerleme" element={<Ilerleme />} />
                            <Route path="profil" element={<Profil />} />
                        </Route>

                        <Route path="/dersler/:dersId/duzenle" element={<DersDuzenle />} />
                        <Route path="/dersler/:dersId" element={<DersDetayLayout />}>
                            <Route index element={<DersGenelBakis />} />
                            <Route path="konular" element={<DersKonular />} />
                            <Route path="ozet" element={<DersOzet />} />
                            <Route path="sohbet" element={<DersSohbet />} />
                            <Route path="testler" element={<DersTestler />} />
                            <Route path="testler/:testId/coz" element={<TestCoz />} />
                            <Route path="testler/:testId/sonuc" element={<TestSonucu />} />
                            <Route path="calisma-kartlari" element={<DersCalismaKartlari />} />
                        </Route>
                    </Route>
                </Route>

            </Routes>
        </BrowserRouter>
    );
}

export default App;
