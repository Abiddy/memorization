import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "alif_member_id";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/club")) {
    return NextResponse.next();
  }

  const hasMember = request.cookies.get(COOKIE)?.value;
  if (!hasMember) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/club/:path*"],
};
