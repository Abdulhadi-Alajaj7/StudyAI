
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function DersAdimScroll() {
    const { pathname } = useLocation();

    useEffect(() => {
        const dersAdimiMi =
            pathname === "/panel/dersler/yeni" ||
            /^\/panel\/dersler\/[^/]+\/(materyal|hazir)$/.test(pathname);

        if (!dersAdimiMi) return;

        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, [pathname]);

    return null;
}
