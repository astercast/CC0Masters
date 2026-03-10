export interface EnergyInfo {
  total: number;
  collected: number;
}

export interface SpeciesEntry {
  number: number;
  name: string;
  energy: string;
  rarity: string;
  collected: boolean;
  tokenIds: number[];
}

export interface CollectorData {
  address: string;
  totalCC0mon: number;
  collected: number;
  missing: number;
  progress: string;
  totalTokensHeld: number;
  byEnergy: Record<string, EnergyInfo>;
  checklist: SpeciesEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  collected: number;
  missing: number;
  progress: string;
  totalTokensHeld: number;
  byEnergy: Record<string, EnergyInfo>;
  checklist: SpeciesEntry[];
}

export interface LeaderboardData {
  updatedAt: string;
  totalOwners: number;
  totalTokensScanned: number;
  leaders: LeaderboardEntry[];
}
