import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

export default function SifreAlani({ id, baslik, className, ...props }) {
    const [acik, setAcik] = useState(false);
    return <div><label htmlFor={id} className="mb-2 block text-sm font-medium">{baslik}</label>
        <div className="relative"><input {...props} id={id} name={id} type={acik ? "text" : "password"} required className={`${className} pr-12`} />
            <button type="button" aria-label={`${baslik}: ${acik ? "şifreyi gizle" : "şifreyi göster"}`} aria-pressed={acik}
                onClick={() => setAcik(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 focus-visible:outline-2 focus-visible:outline-violet-400">
                {acik ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}</button></div></div>;
}
