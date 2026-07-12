import {
  FieldValue,
  type DocumentReference,
} from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminBucket, getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  firebaseStorageDownloadUrl,
  newFirebaseStorageDownloadToken,
} from "@/lib/firebase-storage-url";
import { serializeDoc } from "@/lib/serialize-firestore";
import {
  DEFAULT_STACK_ORDER,
  isSnailArtCategory,
  type SnailArtCategory,
} from "@/lib/snail-art-types";
import { normalizeSnailArtSlug } from "@/lib/snail-art-slug";
import {
  categoryAllowsRecolor,
  parseSnailArtRecolorPolicy,
} from "@/lib/snail-art-recolor-policy";
import { isSnailArtAllowedExt, SNAIL_ART_ALLOWED_EXT } from "@/lib/snail-art-upload-spec";
import { validateSnailArtBuffer } from "@/lib/validate-snail-art-buffer";

const MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
};

/** Multipart upload: create or replace file + metadata in `snailArtAssets` + Storage `snail-art-assets/{category}/{slug}.ext` */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const categoryRaw = formData.get("category")?.toString().trim() ?? "";
    if (!isSnailArtCategory(categoryRaw)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const category = categoryRaw as SnailArtCategory;

    const displayName = formData.get("displayName")?.toString().trim() ?? "";
    if (!displayName) {
      return NextResponse.json({ error: "displayName required" }, { status: 400 });
    }

    const stackOrderRaw = formData.get("stackOrder")?.toString();
    const stackOrderParsed = stackOrderRaw ? Number(stackOrderRaw) : NaN;
    const stackOrder = Number.isFinite(stackOrderParsed)
      ? stackOrderParsed
      : DEFAULT_STACK_ORDER[category];

    const replaceAssetId = formData.get("assetId")?.toString().trim() ?? "";
    let slug = formData.get("slug")?.toString().trim() ?? "";

    const db = getAdminDb();
    const bucket = getAdminBucket();

    let storagePath: string;
    let docRef: DocumentReference;

    const origName = file.name || "asset.svg";
    const lastDot = origName.lastIndexOf(".");
    const ext = lastDot >= 0 ? origName.slice(lastDot + 1).toLowerCase() : "svg";
    if (!isSnailArtAllowedExt(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type .${ext}. Allowed: ${SNAIL_ART_ALLOWED_EXT.join(", ")}.` },
        { status: 400 },
      );
    }
    const fileFormat: "svg" | "png" = ext === "svg" ? "svg" : "png";

    const buffer = Buffer.from(await file.arrayBuffer());
    const dimensionCheck = validateSnailArtBuffer(buffer, ext);
    if (!dimensionCheck.ok) {
      return NextResponse.json({ error: dimensionCheck.error }, { status: 400 });
    }

    const contentType = file.type || MIME[ext] || "application/octet-stream";

    if (replaceAssetId) {
      docRef = db.collection("snailArtAssets").doc(replaceAssetId);
      const existing = await docRef.get();
      if (!existing.exists) {
        return NextResponse.json({ error: "asset not found" }, { status: 404 });
      }
      storagePath = existing.get("storagePath") as string;
      if (!storagePath?.trim()) {
        return NextResponse.json({ error: "asset missing storagePath" }, { status: 500 });
      }
      const pathExt = storagePath.split(".").pop()?.toLowerCase();
      if (pathExt && pathExt !== ext) {
        return NextResponse.json(
          { error: `Replace file must match extension (.${pathExt})` },
          { status: 400 },
        );
      }
    } else {
      let normalized: string;
      try {
        normalized = normalizeSnailArtSlug(slug || displayName);
      } catch {
        return NextResponse.json({ error: "Invalid slug — use letters, numbers, hyphens" }, { status: 400 });
      }
      slug = normalized;
      const dup = await db
        .collection("snailArtAssets")
        .where("category", "==", category)
        .where("slug", "==", slug)
        .limit(1)
        .get();
      if (!dup.empty) {
        return NextResponse.json({ error: "slug already exists for this category" }, { status: 409 });
      }
      storagePath = `snail-art-assets/${category}/${slug}.${ext}`;
      docRef = db.collection("snailArtAssets").doc();
    }

    const downloadToken = newFirebaseStorageDownloadToken();
    const gcsFile = bucket.file(storagePath);
    await gcsFile.save(buffer, {
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });
    const storageUrl = firebaseStorageDownloadUrl(bucket.name, storagePath, downloadToken);

    const policySnap = await db.collection("adminSettings").doc("snailArtRecolorPolicy").get();
    const recolorPolicy = parseSnailArtRecolorPolicy(serializeDoc(policySnap.data() ?? undefined));
    const recolorable = categoryAllowsRecolor(recolorPolicy, category);

    const dimensionFields = {
      widthPx: dimensionCheck.width,
      heightPx: dimensionCheck.height,
    };

    if (replaceAssetId) {
      await docRef.set(
        {
          storageUrl,
          fileFormat,
          recolorable,
          status: "published",
          ...dimensionFields,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      await docRef.set({
        category,
        slug,
        displayName,
        description: "",
        storagePath,
        storageUrl,
        stackOrder,
        fileFormat,
        recolorable,
        status: "published",
        ...dimensionFields,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const saved = await docRef.get();
    return NextResponse.json({ id: saved.id, ...serializeDoc(saved.data()) });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}

