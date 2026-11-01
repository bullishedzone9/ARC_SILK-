# ARC_SILK — Standalone MetaMask Bot Test Console

This branch contains an isolated wallet-connectivity preview, not a live trading bot.

## Current verified scope
- Detects an injected EIP-1193 wallet provider (MetaMask).
- Requests account connection through MetaMask.
- Reads connected account and chain ID.
- Requests network switching through MetaMask.
- Does not request signatures, token approvals, swaps, transfers, or private keys.

## Networks listed
Ethereum, BNB Smart Chain, Base, Polygon, plus Sepolia, BNB Testnet, Base Sepolia, and Polygon Amoy.

## Not implemented
Market discovery adapters, contract/rug checks, tracked-wallet ingestion, JUDGE decision persistence, transaction construction, execution simulation, order approval queue, exit monitoring, and reporting.

## Safety
Do not use this preview to trade. Mainnet trading remains disabled until the execution path has tests, transaction simulation, explicit approval controls, and an independent security review.
