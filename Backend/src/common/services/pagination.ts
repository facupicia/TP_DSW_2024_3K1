/**
 * Pagination helper for TypeORM queries.
 * Usage: const { skip, take, page, limit } = getPagination(req.query);
 */
export const getPagination = (query: any, defaultLimit = 50, maxLimit = 100) => {
    const page = Math.max(1, parseInt(query?.page as string) || 1);
    const limit = Math.min(maxLimit, parseInt(query?.limit as string) || defaultLimit);
    const skip = (page - 1) * limit;
    return { page, limit, skip, take: limit };
};

/**
 * Safe select fields for User to avoid loading sensitive data.
 */
export const USER_PUBLIC_SELECT = [
    'id', 'firstname', 'lastname', 'email', 'phone',
    'pais', 'provincia', 'ciudad', 'birth', 'imgPerfil', 'active', 'mpUserId'
] as const;
