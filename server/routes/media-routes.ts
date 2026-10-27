import type { ApiRouteModuleContext } from "../api-router.js";
import {
  idParamSchema,
  mediaAssetIdsQuerySchema,
  mediaPurposeSchema,
  mediaUrlsBatchSchema,
  mediaUploadSchema,
} from "./schemas.js";

export function registerMediaRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    parse,
    asyncRoute,
    send,
    ApiHttpError,
  } = context;
  const media = () => {
    if (!dependencies.media)
      throw new ApiHttpError(
        503,
        "media_unavailable",
        "Media pipeline is not configured",
      );
    return dependencies.media;
  };

  router.post(
    "/api/media/uploads",
    asyncRoute(async (request, response) => {
      const actor = await scoped(request, response, "agent");
      send(
        response,
        201,
        await media().createUpload(
          actor,
          parse(mediaUploadSchema, request.body),
        ),
      );
    }),
  );

  router.post(
    "/api/media/assets/:id/complete",
    asyncRoute(async (request, response) => {
      const actor = await scoped(request, response, "agent");
      const { id } = parse(idParamSchema, request.params);
      send(response, 202, await media().complete(actor, id));
    }),
  );

  router.get(
    "/api/media/assets",
    asyncRoute(async (request, response) => {
      const actor = await scoped(request, response);
      const query = parse(mediaAssetIdsQuerySchema, request.query);
      send(response, 200, {
        data: await media().listAssets(
          actor,
          query.ids.split(",").map((id) => id.trim()),
        ),
      });
    }),
  );

  router.get(
    "/api/media/assets/:id/url",
    asyncRoute(async (request, response) => {
      const actor = await scoped(request, response);
      const { id } = parse(idParamSchema, request.params);
      const purpose = parse(
        mediaPurposeSchema,
        request.query.purpose ?? "browser",
      );
      send(response, 200, await media().signedUrl(actor, id, purpose));
    }),
  );

  // Batch form of the single-asset endpoint: same auth and workspace scope,
  // one result per id (unknown or foreign ids come back as errors, no URL).
  router.post(
    "/api/media/urls",
    asyncRoute(async (request, response) => {
      const actor = await scoped(request, response);
      const input = parse(mediaUrlsBatchSchema, request.body);
      send(response, 200, {
        data: await media().signedUrls(actor, input.ids, input.purpose),
      });
    }),
  );
}
