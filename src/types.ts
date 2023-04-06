import { Coin } from '@cosmjs/amino';
export type Address = string;

export type Binary = string;

/** Port of [Env (Rust)](https://docs.rs/cosmwasm-std/1.1.4/cosmwasm_std/struct.Env.html) */
export type Env =
  | {
      block: BlockInfo;
      contract: ContractInfo;
    }
  | {
      block: BlockInfo;
      transaction: TransactionInfo | null;
      contract: ContractInfo;
    };

export interface Attribute {
  key: string;
  value: string;
}

export interface Event {
  type: string;
  attributes: Attribute[];
}

export interface SubMsg {
  id: number;
  msg: CosmosMsg;
  gas_limit: number | null;
  reply_on: ReplyOn;
}

export enum ReplyOn {
  Always = 'always',
  Never = 'never',
  Success = 'success',
  Error = 'error',
}

export interface BlockInfo {
  height: number | string;
  time: number | string;
  chain_id: string;
}

export interface TransactionInfo {
  index: number | string;
}

export interface ContractInfo {
  address: Address;
}

/** Port of [MessageInfo (Rust)](https://docs.rs/cosmwasm-std/1.1.4/cosmwasm_std/struct.MessageInfo.html) */
export interface MessageInfo {
  sender: Address;
  funds: Coin[];
}

export type BankMsg =
  | {
      send: {
        to_address: Address;
        amount: Coin[];
      };
    }
  | {
      burn: {
        amount: Coin[];
      };
    };

export interface Execute {
  contract_addr: Address;
  msg: string;
  funds: Coin[];
}

export interface Instantiate {
  admin: Address | null;
  code_id: number;
  msg: string;
  funds: Coin[];
  label: string;
}

export type WasmMsg = { execute: Execute } | { instantiate: Instantiate };

/// IBC types
export interface IbcTimeoutBlock {
  revision: number;
  height: number;
}

export interface IbcTimeout {
  block?: IbcTimeoutBlock;
  timestamp?: string;
}

export type IbcMsg =
  | {
      transfer: {
        channel_id: String;
        to_address: Address;
        amount: Coin;
        /// when packet times out, measured on remote chain
        timeout: IbcTimeout;
      };
    }
  | {
      send_packet: {
        channel_id: String;
        data: Binary;
        /// when packet times out, measured on remote chain
        timeout: IbcTimeout;
      };
    }
  | {
      close_channel: { channel_id: String };
    };

export type CosmosMsg =
  | {
      bank: BankMsg;
    }
  | { wasm: WasmMsg }
  | { ibc: IbcMsg };

/// response

export interface ContractResponse {
  messages: SubMsg[];
  events: Event[];
  attributes: Attribute[];
  data: Binary | null;
}
