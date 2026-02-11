
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Fuel, Navigation, Info, TrendingDown, Gauge, AlertCircle, Sparkles, XCircle, X, MapPin, ExternalLink, RefreshCw, Plus, Minus, Droplets, Flame, Leaf, MousePointer2, ChevronDown, ChevronUp } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { FuelData } from './types';
import { calculateSavings } from './utils/calculations';
import { GoogleGenAI, Type } from "@google/genai";

type ValidationErrors = {
  [K in keyof FuelData]?: string;
};

interface ProvincialPrices {
  province: string;
  prices: {
    benzina: string;
    diesel: string;
    gpl: string;
    metano: string;
  };
  sources: { title: string; uri: string }[];
}

/**
 * Componente per la gestione avanzata dell'input numerico.
 * Ottimizzato per mobile e desktop con supporto a virgola/punto e pressione prolungata.
 */
const SmartNumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  unit: string;
  step?: number;
  error?: string;
}> = ({ label, value, onChange, unit, step = 0.01, error }) => {
  const [inputValue, setInputValue] = useState(value.toString().replace('.', ','));
  const timerRef = useRef<number | null>(null);
  const initialDelayRef = useRef<number | null>(null);
  
  // Ref per evitare stale closure nell'intervallo della pressione prolungata
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
    const formattedValue = value.toString().replace('.', ',');
    if (parseFloat(inputValue.replace(',', '.')) !== value) {
      setInputValue(formattedValue);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.value;
    const normalized = original.replace(',', '.');
    
    if (/^-?[0-9]*[.,]?[0-9]*$/.test(original)) {
      setInputValue(original);
      const parsed = parseFloat(normalized);
      if (!isNaN(parsed)) {
        onChange(parsed);
      } else if (normalized === "" || normalized === "-" || normalized === ".") {
        onChange(0);
      }
    }
  };

  const stopAdjusting = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (initialDelayRef.current) clearTimeout(initialDelayRef.current);
    timerRef.current = null;
    initialDelayRef.current = null;
  }, []);

  const startAdjusting = (delta: number) => {
    stopAdjusting();
    
    // Funzione interna che usa il ref per evitare valori vecchi
    const performUpdate = (d: number) => {
      const nextVal = Math.max(0, Number((valueRef.current + d).toFixed(3)));
      onChange(nextVal);
    };

    performUpdate(delta); // Primo scatto immediato

    initialDelayRef.current = window.setTimeout(() => {
      let speed = 80;
      let count = 0;
      
      const run = () => {
        performUpdate(delta);
        count++;
        
        if (count === 10) speed = 40;
        if (count === 30) speed = 15;
        
        timerRef.current = window.setTimeout(run, speed);
      };
      
      timerRef.current = window.setTimeout(run, speed);
    }, 400);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <div className="flex items-center gap-1">
        <div className="relative flex-1 group">
          <input 
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={() => setInputValue(value.toString().replace('.', ','))}
            className={`w-full pl-3 pr-10 py-2.5 border-2 rounded-lg text-sm font-bold transition-all shadow-sm outline-none ${
              error ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-100 focus:border-emerald-500 bg-white text-slate-800'
            }`}
          />
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black pointer-events-none ${error ? 'text-red-400' : 'text-slate-300'}`}>{unit}</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <button 
            type="button"
            onPointerDown={(e) => { e.preventDefault(); startAdjusting(step); }}
            onPointerUp={stopAdjusting}
            onPointerLeave={stopAdjusting}
            onContextMenu={(e) => e.preventDefault()}
            className="p-1.5 bg-white border-2 border-slate-100 rounded-md hover:bg-slate-50 text-slate-400 hover:text-emerald-600 transition-colors active:scale-95 touch-none select-none"
          >
            <Plus size={14} />
          </button>
          <button 
            type="button"
            onPointerDown={(e) => { e.preventDefault(); startAdjusting(-step); }}
            onPointerUp={stopAdjusting}
            onPointerLeave={stopAdjusting}
            onContextMenu={(e) => e.preventDefault()}
            className="p-1.5 bg-white border-2 border-slate-100 rounded-md hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors active:scale-95 touch-none select-none"
          >
            <Minus size={14} />
          </button>
        </div>
      </div>
      {error && (
        <p className="text-[9px] text-red-500 flex items-center gap-1 font-bold mt-0.5">
          <XCircle size={10} />
          {error}
        </p>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [data, setData] = useState<FuelData>({
    priceOnRoad: 1.699,
    priceOffRoad: 1.599,
    litersToRefuel: 25,
    consumptionKmL: 18,
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  
  const [provincialData, setProvincialData] = useState<ProvincialPrices | null>(null);
  const [loadingProvince, setLoadingProvince] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string>('');
  const [isProvincialCollapsed, setIsProvincialCollapsed] = useState<boolean>(false);

  const results = useMemo(() => calculateSavings(data), [data]);
  const hasErrors = useMemo(() => Object.values(errors).some(error => !!error), [errors]);

  const chartData = useMemo(() => {
    if (hasErrors) return [];
    const points = [];
    const breakEvenTotal = results.extraKms;
    const maxRange = Math.max(breakEvenTotal * 1.3, 5);
    const stepVal = maxRange / 100;
    
    for (let d = 0; d <= maxRange; d += stepVal) {
      const netKmGain = breakEvenTotal - d;
      points.push({
        totalDist: parseFloat(d.toFixed(2)),
        netGain: parseFloat(netKmGain.toFixed(2)),
      });
    }
    return points;
  }, [results, hasErrors]);

  const validate = (field: keyof FuelData, value: number) => {
    let error = '';
    if (isNaN(value) || value === null) {
      error = 'Valore non valido';
    } else if (value <= 0) {
      error = 'Deve essere > 0';
    }
    if (field === 'priceOffRoad' && value >= data.priceOnRoad && value > 0) {
      error = 'Deve essere inferiore al prezzo A';
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return error;
  };

  const handleUpdate = (field: keyof FuelData, val: number) => {
    setData(prev => ({ ...prev, [field]: val }));
    validate(field, val);
    if (field === 'priceOnRoad') {
      validate('priceOffRoad', data.priceOffRoad);
    }
  };

  const applyProvincialPrice = (priceStr: string) => {
    const cleaned = priceStr.replace(/[^0-9,.]/g, '').replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      setData(prev => ({
        ...prev,
        priceOnRoad: num,
        priceOffRoad: num
      }));
      // Reset errors for both since they are now the same
      setErrors(prev => ({ ...prev, priceOnRoad: '', priceOffRoad: '' }));
    }
  };

  const fetchProvincialPrices = async () => {
    setLoadingProvince(true);
    setLocationError('');
    setIsProvincialCollapsed(false);
    
    if (!navigator.geolocation) {
      setLocationError("Geolocalizzazione non supportata.");
      setLoadingProvince(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Identifica la PROVINCIA italiana per le coordinate ${latitude}, ${longitude}. 
          Cerca i PREZZI MEDI PROVINCIALI odierni per Benzina, Diesel, GPL e Metano utilizzando ESCLUSIVAMENTE il sito https://www.alvolante.it/prezzo-gasolio come fonte.
          IMPORTANTE: Naviga tra le sottosezioni del sito (es. /prezzo-benzina, /prezzo-gpl, /prezzo-metano) partendo dall'URL indicato per recuperare le medie corrette della PROVINCIA identificata. 
          Assicurati di estrarre i valori specifici per OGNI tipo di carburante.
          Restituisci ESCLUSIVAMENTE un oggetto JSON con questa struttura: 
          { "province": "Nome Provincia", "prices": { "benzina": "valore €/L", "diesel": "valore €/L", "gpl": "valore €/L", "metano": "valore €/KG" } }`,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Risposta non valida");
        
        const parsed = JSON.parse(jsonMatch[0]);
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
          ?.filter(chunk => chunk.web)
          .map(chunk => ({ title: chunk.web?.title || 'Fonte Prezzi', uri: chunk.web?.uri || '' }))
          .slice(0, 3) || [];

        setProvincialData({
          province: parsed.province,
          prices: parsed.prices,
          sources: sources
        });
      } catch (err) {
        console.error(err);
        setLocationError("Impossibile recuperare i prezzi provinciali accurati da AlVolante.");
      } finally {
        setLoadingProvince(false);
      }
    }, (err) => {
      setLoadingProvince(false);
      if (err.code === 1) setLocationError("Permesso negato.");
      else if (err.code === 3) setLocationError("Timeout rilevamento.");
      else setLocationError("Errore GPS.");
    }, { timeout: 12000, enableHighAccuracy: true });
  };

  const fetchAiAdvice = async () => {
    if (hasErrors) return;
    setLoadingAi(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analizza questa situazione di rifornimento: 
      - Prezzo attuale sulla rotta: ${data.priceOnRoad} €/L
      - Prezzo distributore fuori rotta: ${data.priceOffRoad} €/L
      - Litri da rifornire: ${data.litersToRefuel} L
      - Consumo auto: ${data.consumptionKmL} km/L
      - Risparmio lordo calcolato: ${results.savingsEuro.toFixed(2)} €
      - Budget chilometrico di pareggio (andata+ritorno): ${results.extraKms.toFixed(1)} km

      Dammi un consiglio strategico rapido in italiano. 
      Includi esplicitamente un quantitativo di chilometri (es. "Fino a X km") entro il quale la deviazione è considerata vantaggiosa e sensata, considerando anche il tempo perso. Sii conciso. 
      IMPORTANTE: Non usare alcun tipo di formattazione Markdown, specialmente asterischi per il grassetto o elenchi puntati. Solo testo piano.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      const cleanText = (response.text || "").replace(/\*/g, "");
      setAiAdvice(cleanText || "Nessun consiglio disponibile.");
    } catch (error) {
      setAiAdvice("Errore nel recupero del consiglio AI.");
    } finally {
      setLoadingAi(false);
    }
  };

  const fuelIcons: Record<string, React.ReactNode> = {
    benzina: <Droplets size={16} className="text-blue-500" />,
    diesel: <Droplets size={16} className="text-slate-600" />,
    gpl: <Leaf size={16} className="text-emerald-500" />,
    metano: <Flame size={16} className="text-blue-400" />
  };

  const fuelColors: Record<string, string> = {
    benzina: 'border-blue-100 bg-blue-50/30',
    diesel: 'border-slate-100 bg-slate-50/30',
    gpl: 'border-emerald-100 bg-emerald-50/30',
    metano: 'border-blue-50 bg-blue-50/20'
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-emerald-600 text-white py-6 px-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500 rounded-lg shadow-inner">
              <Fuel size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tighter uppercase">FuelWise</h1>
          </div>
          <p className="hidden sm:block text-emerald-100 text-sm font-medium">Trova il Risparmio Ideale</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {/* Medie Provinciali Espansa */}
        <section className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 mb-4 relative overflow-hidden transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <MapPin size={22} className="text-emerald-600" />
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Medie Provinciali
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-tight">Dati provinciali odierni</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={fetchProvincialPrices}
                disabled={loadingProvince}
                className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 py-2.5 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200 disabled:opacity-50"
              >
                {loadingProvince ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {provincialData ? 'Aggiorna Prezzi' : 'Rileva Mia Posizione'}
              </button>
              {provincialData && (
                <button 
                  onClick={() => setIsProvincialCollapsed(!isProvincialCollapsed)}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                  title={isProvincialCollapsed ? "Espandi" : "Riduci"}
                >
                  {isProvincialCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                </button>
              )}
            </div>
          </div>

          {!isProvincialCollapsed && (
            <>
              {loadingProvince ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-pulse flex flex-col items-center gap-3">
                    <div className="h-4 w-48 bg-slate-100 rounded-full"></div>
                    <div className="h-8 w-32 bg-slate-50 rounded-lg mt-2"></div>
                    <p className="text-[10px] font-black text-slate-300 uppercase animate-pulse">Ricerca AI Multicategoria...</p>
                  </div>
                </div>
              ) : provincialData ? (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="mb-6 text-center">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-emerald-200 shadow-sm">
                      Provincia di {provincialData.province}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {Object.entries(provincialData.prices).map(([key, val]) => (
                      <div 
                        key={key} 
                        className={`group p-4 rounded-2xl border-2 transition-all hover:scale-[1.02] ${fuelColors[key.toLowerCase()] || 'border-slate-100 bg-slate-50/30'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {fuelIcons[key.toLowerCase()] || <Droplets size={16} />}
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{key}</span>
                          </div>
                          <MousePointer2 size={12} className="text-emerald-400 opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xl font-black text-slate-800 tracking-tight">{val}</span>
                          <button 
                            onClick={() => applyProvincialPrice(val)}
                            className="mt-3 w-full bg-white/80 hover:bg-emerald-600 hover:text-white border border-slate-200 text-slate-600 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            APPLICA
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {provincialData.sources.length > 0 && (
                    <div className="flex flex-wrap gap-4 items-center justify-center mt-2 border-t border-slate-50 pt-4">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight flex items-center gap-1.5"><Info size={12} /> Fonti:</span>
                      {provincialData.sources.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-emerald-600 flex items-center gap-1.5 hover:underline">
                          {s.title} <ExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  {locationError ? (
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle size={24} className="text-red-300" />
                      <p className="text-xs font-bold text-red-500">{locationError}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Navigation size={24} className="text-slate-200" />
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest max-w-[250px] mx-auto leading-relaxed">
                        Usa la tua posizione per caricare automaticamente i prezzi medi della tua PROVINCIA
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {isProvincialCollapsed && provincialData && (
            <div className="flex items-center justify-center animate-in fade-in duration-300">
               <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-emerald-100">
                 Prov. {provincialData.province} (Caricato)
               </span>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5 h-fit">
            <h2 className="text-xs font-black mb-5 flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3 uppercase tracking-widest">
              <Navigation size={18} className="text-emerald-600" />
              I Tuoi Dati
            </h2>
            <div className="space-y-4">
              <SmartNumberInput 
                label="Prezzo Standard (A)" 
                unit="€/L" 
                value={data.priceOnRoad} 
                onChange={(val) => handleUpdate('priceOnRoad', val)}
                step={0.001}
                error={errors.priceOnRoad}
              />
              <SmartNumberInput 
                label="Prezzo Scontato (B)" 
                unit="€/L" 
                value={data.priceOffRoad} 
                onChange={(val) => handleUpdate('priceOffRoad', val)}
                step={0.001}
                error={errors.priceOffRoad}
              />
              <div className="grid grid-cols-2 gap-4">
                <SmartNumberInput 
                  label="Litri Totali" 
                  unit="L" 
                  value={data.litersToRefuel} 
                  onChange={(val) => handleUpdate('litersToRefuel', val)}
                  step={1}
                  error={errors.litersToRefuel}
                />
                <SmartNumberInput 
                  label="Consumo" 
                  unit="km/L" 
                  value={data.consumptionKmL} 
                  onChange={(val) => handleUpdate('consumptionKmL', val)}
                  step={0.5}
                  error={errors.consumptionKmL}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">Analisi Risparmio</h2>
                <TrendingDown size={20} className={hasErrors ? "text-slate-200" : "text-emerald-500"} />
              </div>
              
              <div className="space-y-6">
                <div className={hasErrors ? "opacity-30" : ""}>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest font-black">Risparmio Lordo Massimo</p>
                  <p className="text-4xl font-black text-emerald-600 tracking-tighter">
                    {hasErrors ? '€--' : `€${results.savingsEuro.toFixed(2)}`}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Gauge size={14} className={hasErrors ? "text-slate-300" : "text-blue-600"} />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Pareggio Km</span>
                    </div>
                    <p className={`text-lg font-black ${hasErrors ? 'text-slate-300' : 'text-slate-900'}`}>
                      {hasErrors ? '--' : `${results.extraKms.toFixed(1)}`}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertCircle size={14} className={hasErrors ? "text-slate-300" : "text-orange-600"} />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Raggio Max</span>
                    </div>
                    <p className={`text-lg font-black ${hasErrors ? 'text-slate-300' : 'text-slate-900'}`}>
                      {hasErrors ? '--' : `${results.maxOneWayDistance.toFixed(1)}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={fetchAiAdvice}
              disabled={loadingAi || hasErrors}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-30 shadow-md"
            >
              {loadingAi ? <RefreshCw size={14} className="animate-spin" /> : <><Sparkles size={16} className="text-yellow-400" /> Consiglio Strategico AI</>}
            </button>
            
            {aiAdvice && !hasErrors && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 shadow-sm relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                <button onClick={() => setAiAdvice('')} className="absolute top-3 right-3 p-1 text-emerald-400 hover:text-emerald-600 rounded-full transition-colors"><X size={16} /></button>
                <h3 className="text-emerald-900 text-[10px] font-black flex items-center gap-2 mb-2 uppercase tracking-tight"><Sparkles size={14} className="text-emerald-600" /> Feedback AI</h3>
                <p className="text-emerald-900/80 text-xs italic font-medium pr-6 leading-relaxed whitespace-pre-line">{aiAdvice}</p>
              </div>
            )}
          </section>
        </div>

        {/* Grafico */}
        <section className={`mt-4 bg-white rounded-2xl shadow-lg border border-slate-100 p-5 transition-all ${hasErrors ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Soglia di Convenienza</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Guadagno Km vs Distanza Deviazione</p>
            </div>
          </div>
          
          <div className="h-72 w-full min-h-[288px] min-w-0 overflow-hidden relative">
            {!hasErrors && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="totalDist" 
                    type="number"
                    domain={[0, 'auto']}
                    fontSize={10}
                    tick={{ fill: '#94a3b8', fontWeight: 700 }}
                  />
                  <YAxis 
                    fontSize={10}
                    tick={{ fill: '#94a3b8', fontWeight: 700 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                    formatter={(val: number) => [`${val} km`, 'Saldo Netto']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="netGain" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    fill="url(#colorSavings)" 
                    isAnimationActive={false}
                  />
                  <ReferenceLine 
                    x={results.extraKms} 
                    stroke="#f97316" 
                    strokeWidth={2}
                    strokeDasharray="4 4" 
                    label={{ position: 'top', value: 'PAREGGIO', fill: '#f97316', fontSize: 9, fontWeight: 900 }} 
                  />
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-6 z-10 md:hidden shadow-2xl">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <div className="text-center">
            <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Risparmio</p>
            <p className={`text-lg font-black ${hasErrors ? 'text-slate-200' : 'text-emerald-600'}`}>
              {hasErrors ? '€--' : `€${results.savingsEuro.toFixed(2)}`}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="text-center">
            <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Budget Km</p>
            <p className={`text-lg font-black ${hasErrors ? 'text-slate-200' : 'text-slate-900'}`}>
              {hasErrors ? '--' : `${results.extraKms.toFixed(1)}`}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
