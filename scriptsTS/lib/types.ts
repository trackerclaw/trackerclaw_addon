export interface WalletRecord {
  label: string;
  address: string;
}

export interface TokenPosition {
  mint: string;
  symbol: string;
  amount: number;
  decimals: number;
  is_native: boolean;
  token_type: string;
}

export interface EnrichedToken {
  symbol: string;
  mint: string;
  amount: number;
  price_usd?: number;
  price?: number;
  value_usd?: number;
  usd_value?: number;
  token_type?: string;
}

export interface DefiPosition {
  protocol: string;
  type: string;
  account: string;
  url: string;
  usd_value?: number;
  value_usd?: number;
  details?: Record<string, unknown>;
}

export interface WalletPortfolioJson {
  address: string;
  spot: {
    total_usd: number;
    token_count: number;
    visible_token_count: number;
    hidden_token_count: number;
    tokens: Array<{
      symbol: string;
      mint: string;
      amount: number;
      price_usd: number;
      value_usd: number;
      token_type: string;
    }>;
  };
  defi: {
    total_usd: number;
    protocol_count: number;
    position_count: number;
    protocols: Array<{
      protocol: string;
      total_usd: number;
      positions: DefiPosition[];
    }>;
    positions: DefiPosition[];
  };
  totals: {
    spot_usd: number;
    defi_usd: number;
    combined_usd: number;
  };
}
