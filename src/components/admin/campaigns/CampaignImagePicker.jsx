import { useEffect, useState } from "react";
import { Modal } from "../../ui";
import { campaignRequest } from "../../../utils/campaignWorkspaceApi";
import { readFileAsDataUrl } from "../../../utils/uploadBlogImage";
import { compressImageFile } from "../../../utils/compressImageFile";
export default function CampaignImagePicker({ onSelect, disabled = false }) {
  const [open, setOpen] = useState(false),
    [assets, setAssets] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      void campaignRequest("/assets")
        .then(setAssets)
        .catch((e) => setError(e.message));
  }, [open]);
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await compressImageFile(file);
      const asset = await campaignRequest("/assets", {
        method: "POST",
        body: { image: await readFileAsDataUrl(prepared), name: file.name },
      });
      setAssets((old) => [asset, ...old]);
      onSelect(asset.url);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className="text-sm text-blue-600"
        onClick={() => setOpen(true)}
      >
        Choose or upload image
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Image Library"
        size="lg"
      >
        <label className="inline-block bg-blue-600 text-white rounded-lg px-4 py-2 cursor-pointer text-sm">
          {busy ? "Uploading…" : "Upload Image"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={upload}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-600 text-sm mt-3">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className="text-left border rounded-lg p-2 hover:border-blue-600"
              onClick={() => {
                onSelect(asset.url);
                setOpen(false);
              }}
            >
              <img
                alt={asset.name}
                src={asset.url}
                className="w-full h-28 object-contain"
              />
              <span className="block text-xs truncate mt-2">{asset.name}</span>
            </button>
          ))}
        </div>
        {!assets.length && !busy && (
          <p className="text-sm text-navy-500 mt-6">
            Upload your first campaign image.
          </p>
        )}
      </Modal>
    </>
  );
}
