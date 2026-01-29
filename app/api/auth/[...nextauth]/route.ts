import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { pool } from "@/lib/db";

export const authOptions = {
  // Recomendado en prod: define NEXTAUTH_SECRET en .env
  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim();
        const password = credentials?.password;

        if (!email || !password) return null;

        try {
          // ✅ Tu BD usa pgcrypto crypt()
          const { rows } = await pool.query(
            `
            SELECT
              usuario_id,
              email,
              nombre,
              rol
            FROM public.usuario
            WHERE email = $1
              AND activo = true
              AND password_hash = crypt($2, password_hash)
            LIMIT 1
            `,
            [email, password]
          );

          const user = rows[0];
          if (!user) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] CredentialsSignin: user not found or bad password for", email);
            }
            return null;
          }

          return {
            id: user.usuario_id,
            email: user.email,
            name: user.nombre,
            role: user.rol,
          };
        } catch (err) {
          console.error("[auth] authorize() failed:", err);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).role = token.role;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
