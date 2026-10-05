# Reuse policy

Apply the first matching rule after merging input defaults and record overrides:

1. If `requiresAuth` is true and `authorized` is not true, return `blocked`.
2. If `crossTenant` or `corrupt` is true, return `fetch`.
3. If `forceRefresh` is true, return `fetch`.
4. If either `age` or `ttl` is not a finite, nonnegative JSON number, return `revalidate`.
5. If `age <= ttl`, return `reuse`.
6. Otherwise return `revalidate`.

Other fields do not change these decisions. In particular, `offline`, `allowStale`, `sensitive`, and `grace` do not permit expired reuse in this version. This is a fictional classification exercise; it does not implement a network cache.
