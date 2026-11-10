import { RpcException } from '@nestjs/microservices';

interface RpcError {
  code: number;
  details: string;
}

export function getRpcError(error: unknown): RpcError | undefined {
  const value: unknown =
    error instanceof RpcException ? error.getError() : error;
  if (
    value &&
    typeof value === 'object' &&
    'code' in value &&
    typeof value.code === 'number' &&
    'details' in value &&
    typeof value.details === 'string'
  ) {
    return { code: value.code, details: value.details };
  }
  return undefined;
}

export function toRpcException(
  error: unknown,
  fallback: RpcError,
): RpcException {
  if (error instanceof RpcException) return error;

  const rpcError = getRpcError(error);
  if (rpcError) return new RpcException(rpcError);

  console.error(error);
  return new RpcException(fallback);
}
