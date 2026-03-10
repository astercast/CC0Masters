export interface CollectorData {
  address: string;
  collected: number;
  missing: number;
  progress: string;
  totalTokensHeld: number;
  byEnergy: Record<string, { collected: number; total: number }>;
  checklist?: Array<{ number: string; name: string; collected: boolean }>;
}

export interface LeaderboardEntry extends CollectorData {
  rank: number;
}

export interface LeaderboardData {
  updatedAt: string;
  scannedBlock?: number;          // ← new: last Ethereum block checked
  totalOwners: number;
  totalTokensScanned: number;
  leaders: LeaderboardEntry[];
}
