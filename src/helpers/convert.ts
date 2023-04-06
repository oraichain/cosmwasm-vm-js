import { Coin } from '@cosmjs/amino';
import {
  Env,
  MessageInfo,
  SubMsg,
  ContractInfo,
  Attribute,
  Binary,
  Address,
  BankMsg,
  ContractResponse,
  CosmosMsg,
  ReplyOn,
} from '../types';

export interface OlEnv {
  block: OlBlockInfo;
  contract: ContractInfo;
}

export type OldWasmMsg =
  | {
      execute: {
        contract_addr: Address;
        msg: Binary;
        send: Coin[];
      };
    }
  | {
      instantiate: {
        code_id: number;
        msg: Binary;
        send: Coin[];
        label?: string;
      };
    };

export type OldCosmosMsg =
  | {
      bank: BankMsg;
    }
  | { wasm: OldWasmMsg };

export interface OldContractResponse {
  messages: OldCosmosMsg[];
  submessages?: SubMsg[];
  events: Event[];
  attributes: Attribute[];
  data: Binary | null;
}

export interface OlBlockInfo {
  height: number | string;
  time: number;
  time_nanos: number | string;
  chain_id: string;
}
export interface OldMessageInfo {
  sender: Address;
  sent_funds: Coin[];
}

export function getOldEnv({
  contract,
  block: { time, height, chain_id },
}: Env): OlEnv {
  const time_nanos = Number(time);
  return {
    contract,
    block: {
      time: time_nanos / 1_000_000,
      time_nanos,
      height,
      chain_id,
    },
  };
}

export function getOldInfo({ sender, funds }: MessageInfo): OldMessageInfo {
  return {
    sender,
    sent_funds: funds,
  };
}

export function getNewResponse(json: object): object {
  if ('ok' in json) {
    const { submessages, data, attributes, messages } =
      json.ok as OldContractResponse;
    const newResponse: ContractResponse = {
      attributes,
      data,
      events: [],
      messages: [],
    };
    // this is for version 5
    if (submessages) {
      newResponse.messages.push(...submessages);
    }

    for (const message of messages) {
      let newMessage: CosmosMsg | undefined;
      if ('wasm' in message) {
        const oldWasmMsg = message.wasm;
        if ('instantiate' in oldWasmMsg) {
          const { code_id, msg, send, label } = oldWasmMsg.instantiate;

          newMessage = {
            wasm: {
              instantiate: {
                admin: null,
                code_id,
                msg,
                funds: send,
                label: label ?? '',
              },
            },
          };
        } else if ('execute' in oldWasmMsg) {
          const { contract_addr, msg, send } = oldWasmMsg.execute;
          newMessage = {
            wasm: {
              execute: {
                contract_addr,
                msg,
                funds: send,
              },
            },
          };
        }
      } else {
        newMessage = message;
      }

      // other type of message we currently does not support
      if (newMessage) {
        newResponse.messages.push({
          id: 0,
          msg: newMessage,
          reply_on: ReplyOn.Never,
          gas_limit: null,
        });
      }
    }

    return { ok: newResponse };
  }

  return json;
}
