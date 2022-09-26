
export class Token {
  name: string;
  decimals: number;
  symbol: string;
  address: string;
  chainId?: number | string;

  public constructor(chainId: number, address: string, decimals: number, symbol?: string, name?: string) {
    this.chainId = chainId
    this.address = address
    this.decimals = decimals
    this.symbol = symbol || ''
    this.name = name || ''
  }
}

export interface Network {
  chainId: number,
  tokens: {[name: string]: Token},
  baseWrappedToken: Token,
  baseTokenSymbol: string,
  BASES_TO_CHECK_TRADES_AGAINST: Token[],
  ADDITIONAL_BASES: {[tokenAddress: string]: Token[]}
}