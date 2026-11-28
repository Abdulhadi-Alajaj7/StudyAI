import { useId } from "react";
import {
    Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { performansYuzdesi, performansTarihi, performansSayisi as sayiBicimi } from "../utils/dersPerformansSunumu.mjs";

function BasariGrafigi({ kayitlar, kart, ikincil, isDark, bosDurum }) {
    const gradientId = useId();
    const cizgi = isDark ? "#b487fa" : "#7c3aed";
    const eksen = isDark ? "#b7c5db" : "#475569";
    const izgara = isDark ? "#354664" : "#dce3ee";
    return <section className={kart} aria-labelledby="basari-gelisimi">
        <h3 id="basari-gelisimi" className="text-lg font-bold">Başarı Gelişimi</h3>
        <p className={`mb-4 mt-1 text-sm ${ikincil}`}>
            {kayitlar.length ? `Son ${sayiBicimi.format(kayitlar.length)} tamamlanan test` : "Tamamlanan normal ve adaptif testler"}
        </p>
        {kayitlar.length ? <>
            <div className="h-52 min-w-0 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={kayitlar} margin={{ top: 14, right: 14, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={cizgi} stopOpacity={0.38} />
                                <stop offset="100%" stopColor={cizgi} stopOpacity={0.03} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke={izgara} strokeDasharray="4 4" />
                        <XAxis dataKey="etiket" stroke={izgara} tick={{ fill: eksen, fontSize: 11 }} tickLine={false} minTickGap={10} />
                        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow width={43}
                            tick={{ fill: eksen, fontSize: 11 }} tickFormatter={performansYuzdesi} stroke={izgara} tickLine={false} />
                        <Tooltip cursor={{ stroke: izgara, strokeDasharray: "4 4" }} content={({ active, payload }) => {
                            const test = active && payload?.[0]?.payload;
                            return test ? <div className={`${kart} max-w-56 break-words !p-3 text-xs shadow-sm`}>
                                <p className="font-bold">{test.ad}</p>
                                <p className={`mt-1 ${ikincil}`}>{test.tur} · {performansTarihi(test.tamamlanmaTarihi)}</p>
                                <p className="mt-1 font-bold">{performansYuzdesi(test.basari)}</p>
                            </div> : null;
                        }} />
                        <Area type="linear" dataKey="basari" stroke={cizgi} strokeWidth={2.5} fill={`url(#${gradientId})`}
                            dot={{ r: 3, fill: isDark ? "#e9d5ff" : "#fff", stroke: cizgi, strokeWidth: 2 }}
                            activeDot={{ r: 5 }} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <p className={`mt-3 flex items-center gap-2 text-xs ${ikincil}`}>
                <span className="size-2.5 rounded-full bg-violet-500" aria-hidden="true" /> Test Başarı Oranı
            </p>
        </> : bosDurum("Başarı gelişimi, ilk normal veya adaptif test tamamlandığında burada görünecek.")}
    </section>;
}

function SoruGrafigi({ analiz, kart, ikincil, isDark, bosDurum }) {
    const kategoriler = [
        { ad: "Doğru", adet: analiz.dogru, fill: isDark ? "#23d97b" : "#16a34a" },
        { ad: "Yanlış", adet: analiz.yanlis, fill: isDark ? "#ff8185" : "#e11d48" },
        { ad: "Boş", adet: analiz.bos, fill: isDark ? "#7387a4" : "#64748b" }
    ];
    return <section className={kart} aria-labelledby="soru-analizi">
        <h3 id="soru-analizi" className="text-lg font-bold">Soru Analizi</h3>
        {analiz.toplam > 0 ? <>
            <div className="relative mx-auto mt-3 h-44 max-w-64 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={kategoriler} dataKey="adet" nameKey="ad" cx="50%" cy="50%" innerRadius="69%" outerRadius="92%"
                            startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false} />
                        <Tooltip content={({ active, payload }) => {
                            const oge = active && payload?.[0];
                            return oge ? <div className={`${kart} !p-2 text-xs shadow-sm`}>
                                <b>{oge.name}</b> · {sayiBicimi.format(oge.value)} soru · {performansYuzdesi(oge.value * 100 / analiz.toplam)}
                            </div> : null;
                        }} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                    <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">{sayiBicimi.format(analiz.toplam)}</span>
                    <span className={`text-xs ${ikincil}`}>Toplam Soru</span>
                </div>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
                {kategoriler.map(oge => <div key={oge.ad} className="flex flex-wrap items-center justify-between gap-x-2">
                    <dt className={`flex items-center gap-2 ${ikincil}`}><span className="size-2.5 rounded-full" style={{ background: oge.fill }} />{oge.ad}</dt>
                    <dd className="flex items-baseline gap-2"><b>{sayiBicimi.format(oge.adet)}</b>
                        <span className={`text-xs tabular-nums ${ikincil}`}>{performansYuzdesi(oge.adet * 100 / analiz.toplam)}</span>
                    </dd>
                </div>)}
            </dl>
        </> : <div className="mt-4">{bosDurum("Soru analizi için tamamlanmış test sonucu bulunmuyor.")}</div>}
    </section>;
}

export default function DersPerformansGrafikleri({ kayitlar, analiz, isDark, kart, ikincil, bosDurum }) {
    return <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BasariGrafigi kayitlar={kayitlar} isDark={isDark} kart={kart} ikincil={ikincil} bosDurum={bosDurum} />
        <SoruGrafigi analiz={analiz} isDark={isDark} kart={kart} ikincil={ikincil} bosDurum={bosDurum} />
    </div>;
}
