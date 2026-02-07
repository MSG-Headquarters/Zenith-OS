/**
 * Permission Middleware for Zenith OS
 * Checks user role and module access on every request
 */

// Cache for user permissions (simple in-memory, could use Redis)
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get user permissions from database or cache
 */
async function getUserPermissions(pool, userId, organizationId) {
    const cacheKey = `${userId}-${organizationId}`;
    const cached = permissionCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.permissions;
    }

    // Get user's role assignments
    const roleResult = await pool.query(`
        SELECT ur.id, ur.slug, ur.name, ur.is_admin
        FROM user_role_assignments ura
        JOIN user_roles ur ON ura.role_id = ur.id
        WHERE ura.user_id = $1
    `, [userId]);

    const roles = roleResult.rows;
    const isAdmin = roles.some(r => r.is_admin);

    // Get module permissions from roles
    const permResult = await pool.query(`
        SELECT m.slug as module_slug, m.name as module_name, m.icon, m.route, m.sort_order,
               rp.access_level
        FROM role_permissions rp
        JOIN modules m ON rp.module_id = m.id
        JOIN user_role_assignments ura ON rp.role_id = ura.role_id
        WHERE ura.user_id = $1 AND m.is_active = true
        ORDER BY m.sort_order
    `, [userId]);

    // Get user-specific overrides
    const overrideResult = await pool.query(`
        SELECT m.slug as module_slug, umo.access_level
        FROM user_module_overrides umo
        JOIN modules m ON umo.module_id = m.id
        WHERE umo.user_id = $1 
          AND (umo.expires_at IS NULL OR umo.expires_at > NOW())
    `, [userId]);

    // Build permissions map
    const permissions = {};
    
    // Start with role permissions
    for (const perm of permResult.rows) {
        permissions[perm.module_slug] = {
            module_slug: perm.module_slug,
            module_name: perm.module_name,
            icon: perm.icon,
            route: perm.route,
            sort_order: perm.sort_order,
            access_level: perm.access_level
        };
    }

    // Apply overrides (override takes precedence)
    for (const override of overrideResult.rows) {
        if (permissions[override.module_slug]) {
            permissions[override.module_slug].access_level = override.access_level;
            permissions[override.module_slug].is_override = true;
        }
    }

    const result = {
        userId,
        organizationId,
        roles,
        isAdmin,
        modules: permissions
    };

    // Cache it
    permissionCache.set(cacheKey, {
        timestamp: Date.now(),
        permissions: result
    });

    return result;
}

/**
 * Clear permission cache for a user
 */
function clearPermissionCache(userId, organizationId) {
    const cacheKey = `${userId}-${organizationId}`;
    permissionCache.delete(cacheKey);
}

/**
 * Clear all permission cache
 */
function clearAllPermissionCache() {
    permissionCache.clear();
}

/**
 * Check if access level meets minimum requirement
 */
function hasMinimumAccess(userLevel, requiredLevel) {
    const levels = {
        'none': 0,
        'view': 1,
        'request': 2,
        'send': 2,
        'own': 3,
        'own_docs': 3,
        'full': 4
    };
    
    return (levels[userLevel] || 0) >= (levels[requiredLevel] || 0);
}

/**
 * Middleware: Load permissions into request
 */
function loadPermissions(pool) {
    return async (req, res, next) => {
        if (!req.session || !req.session.user) {
            return next();
        }

        try {
            const user = req.session.user;
            const orgId = req.session.org?.id || user.organization_id;
            
            req.permissions = await getUserPermissions(pool, user.id, orgId);
            
            // Add helper methods to request
            req.hasModuleAccess = (moduleSlug, minLevel = 'view') => {
                if (req.permissions.isAdmin) return true;
                const mod = req.permissions.modules[moduleSlug];
                if (!mod) return false;
                return hasMinimumAccess(mod.access_level, minLevel);
            };
            
            req.getAccessLevel = (moduleSlug) => {
                if (req.permissions.isAdmin) return 'full';
                const mod = req.permissions.modules[moduleSlug];
                return mod?.access_level || 'none';
            };

        } catch (error) {
            console.error('[Permissions] Error loading permissions:', error);
        }
        
        next();
    };
}

/**
 * Middleware: Require specific module access
 */
function requirePermission(moduleSlug, minLevel = 'view') {
    return (req, res, next) => {
        // Skip for unauthenticated (auth middleware handles that)
        if (!req.session?.user) {
            return res.redirect('/auth/login');
        }

        // Check user status
        if (req.session.user.status === 'under_review') {
            return res.redirect('/auth/under-review');
        }
        
        if (req.session.user.status === 'terminated') {
            req.session.destroy();
            return res.redirect('/auth/login?error=account_terminated');
        }

        // Check permission
        if (!req.hasModuleAccess || !req.hasModuleAccess(moduleSlug, minLevel)) {
            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Access denied',
                    required_module: moduleSlug,
                    required_level: minLevel
                });
            }
            return res.status(403).render('errors/403', { 
                message: 'You do not have permission to access this module.',
                module: moduleSlug
            });
        }

        next();
    };
}

/**
 * Get sidebar modules for current user
 */
function getSidebarModules(permissions) {
    if (!permissions || !permissions.modules) {
        return [];
    }

    return Object.values(permissions.modules)
        .filter(m => m.access_level !== 'none')
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(m => ({
            slug: m.module_slug,
            name: m.module_name,
            icon: m.icon,
            route: m.route,
            access_level: m.access_level
        }));
}

module.exports = {
    getUserPermissions,
    clearPermissionCache,
    clearAllPermissionCache,
    hasMinimumAccess,
    loadPermissions,
    requirePermission,
    getSidebarModules
};