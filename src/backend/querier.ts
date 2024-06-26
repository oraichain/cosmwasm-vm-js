export interface IQuerier {
  query_raw(request: Uint8Array, gas_limit: number /* Uint64 */): Uint8Array;
}

/** Basic implementation of `IQuerier` with standardized `query_raw`
 * which delegates to a new, abstract `handleQuery` method.
 */
export abstract class QuerierBase implements IQuerier {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  query_raw(request: Uint8Array, gas_limit: number): Uint8Array {
    const queryRequest = parseQuery(request);

    // The Ok(Ok(x)) represents SystemResult<ContractResult<Binary>>
    const result = this.handleQuery(queryRequest);
    const contractResult =
      result instanceof Error
        ? { err: result.message }
        : // result may already in base64 format that starts with {"
          {
            ok:
              // if result is not primative type (number like) then just return
              typeof result === 'string' && Number.isNaN(parseFloat(result))
                ? result
                : objectToBase64(result),
          };

    return objectToUint8Array({ ok: contractResult });
  }

  /** Handle a specific JSON query message. */
  abstract handleQuery(queryRequest: any): any;
}

/** Basic implementation which does not actually implement `handleQuery`. Intended for testing. */
export class BasicQuerier extends QuerierBase {
  handleQuery(queryRequest: any): any {
    throw new Error(
      `Unimplemented - subclass BasicQuerier and provide handleQuery() implementation.`
    );
  }
}

function parseQuery(bytes: Uint8Array): any {
  const query = JSON.parse(new TextDecoder().decode(bytes));
  return query;
}

function objectToBase64(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function objectToUint8Array(obj: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}
