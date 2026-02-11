
import { FuelData, CalculationResult } from '../types';

export const calculateSavings = (data: FuelData): CalculationResult => {
  const { priceOnRoad, priceOffRoad, litersToRefuel, consumptionKmL } = data;

  // Risparmio lordo in Euro
  const savingsEuro = (priceOnRoad - priceOffRoad) * litersToRefuel;
  
  // Costo per km alla stazione economica
  const costPerKm = priceOffRoad / consumptionKmL;
  
  // Quanti km extra si potrebbero percorrere con i soldi risparmiati
  const extraKms = savingsEuro / costPerKm;

  // Raggio massimo di deviazione (andata e ritorno)
  // 2 * d * costPerKm = savingsEuro => d = savingsEuro / (2 * costPerKm)
  const maxOneWayDistance = extraKms / 2;

  return {
    savingsEuro: Math.max(0, savingsEuro),
    extraKms: Math.max(0, extraKms),
    maxOneWayDistance: Math.max(0, maxOneWayDistance),
    costPerKm
  };
};
