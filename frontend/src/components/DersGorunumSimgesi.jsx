import { dersRengiGetir, dersSimgesiGetir } from "../utils/dersGorunumu";

function DersGorunumSimgesi({ renk, simge, isDark, className = "h-12 w-12", iconClassName = "h-6 w-6" }) {
    const renkSecenegi = dersRengiGetir(renk);
    const Simge = dersSimgesiGetir(simge).icon;

    return (
        <div
            className={`${className} ${renkSecenegi.zemin} flex shrink-0 items-center justify-center rounded-xl`}
            aria-hidden="true"
        >
            <Simge className={`${iconClassName} ${isDark ? renkSecenegi.metinKoyu : renkSecenegi.metin}`} />
        </div>
    );
}

export default DersGorunumSimgesi;
