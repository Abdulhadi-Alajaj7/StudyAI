import { useOutletContext } from "react-router-dom";

function DersDetayIcerik({ baslik }) {
    const { isDark } = useOutletContext();

    return (
        <section
            
        >
            <h2 className={`text-[24px] font-bold ${isDark ? "text-[#F8FAFC]" : "text-[#0F172A]"}`}>
                {baslik}
            </h2>
        </section>
    );
}

export default DersDetayIcerik;
