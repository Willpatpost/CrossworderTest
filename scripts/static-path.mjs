import path from 'node:path';

export function isPathInside(rootDir, targetPath) {
    const relativePath = path.relative(rootDir, targetPath);
    return relativePath === ''
        || (!path.isAbsolute(relativePath)
            && relativePath !== '..'
            && !relativePath.startsWith(`..${path.sep}`));
}

export function resolveStaticPath(rootDir, url = '/', baseUrl = 'http://localhost') {
    try {
        const requestUrl = new URL(url, baseUrl);
        const pathname = decodeURIComponent(requestUrl.pathname);
        const relativePath = pathname === '/'
            ? 'index.html'
            : pathname.replace(/^[/\\]+/, '');
        const resolvedPath = path.resolve(rootDir, relativePath);

        return isPathInside(rootDir, resolvedPath) ? resolvedPath : null;
    } catch {
        return null;
    }
}
