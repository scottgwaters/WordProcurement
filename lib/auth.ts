import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/auth",
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
      }
      // Re-read isAdmin from the DB when the token is refreshed so that
      // promoting a user to admin takes effect on their next request
      // without requiring a sign-out + sign-in cycle.
      if (trigger === "update" || (token.id && token.isAdmin === undefined)) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isAdmin: true },
        });
        if (fresh) {
          token.isAdmin = fresh.isAdmin;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});

// Throws a Response-style error an API route can re-raise. Returns the
// session for convenience so callers can use session.user directly.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, error: { status: 401, message: "Unauthorized" } };
  }
  if (!session.user.isAdmin) {
    return { session, error: { status: 403, message: "Admin only" } };
  }
  return { session, error: null as null };
}
