
export interface FuelData {
  priceOnRoad: number;
  priceOffRoad: number;
  litersToRefuel: number;
  consumptionKmL: number;
}

export interface CalculationResult {
  savingsEuro: number;
  extraKms: number;
  maxOneWayDistance: number;
  costPerKm: number;
}
