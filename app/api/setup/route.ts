import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// POST /api/setup - Create the first admin user (only works if no users exist)
export async function POST(request: NextRequest) {
  // Check if any users exist
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return NextResponse.json(
      { error: "Setup already completed. Users exist." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Create the first admin user
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      isAdmin: true,
    },
  });

  return NextResponse.json({
    success: true,
    message: `Admin user created: ${user.email}`,
    userId: user.id,
  });
}

// GET /api/setup - Check if setup is needed
export async function GET() {
  const userCount = await prisma.user.count();

  return NextResponse.json({
    setupRequired: userCount === 0,
    userCount,
  });
}
