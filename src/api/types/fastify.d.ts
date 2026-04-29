import "fastify";
import { ApiAuthUser } from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: ApiAuthUser | null;
  }
}
