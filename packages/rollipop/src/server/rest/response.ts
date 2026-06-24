import type { FastifyReply } from 'fastify';

export function sendNotFound(reply: FastifyReply, message: string) {
  return reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message,
    },
  });
}

export function sendBadRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({
    error: {
      code: 'BAD_REQUEST',
      message,
    },
  });
}

export function sendNotImplemented(reply: FastifyReply, operation: string) {
  return reply.status(501).send({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `${operation} is not implemented yet.`,
    },
  });
}
