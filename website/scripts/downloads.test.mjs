import { test } from "node:test";
import assert from "node:assert/strict";
import { installerUrl, githubReleaseEndpoint, pickWindowsInstaller } from "../assets/js/downloads.js";

test("download actions accept installer files, never release pages or script URLs", () => {
  const base = "https://mla.example/";
  assert.equal(installerUrl("https://github.com/org/repo/releases/latest", base), null);
  assert.equal(installerUrl("javascript:alert(1)", base), null);
  assert.equal(installerUrl("http://other.example/setup.exe", base), null);
  assert.equal(installerUrl("https://github.com/org/repo/releases/download/v1/Setup.exe", base), "https://github.com/org/repo/releases/download/v1/Setup.exe");
  assert.equal(installerUrl("/downloads/Setup.msi", base), "https://mla.example/downloads/Setup.msi");
});
test("resolve only the configured GitHub repository", () => {
  assert.equal(githubReleaseEndpoint("https://github.com/MLA-ex3tav/mla-craft"), "https://api.github.com/repos/MLA-ex3tav/mla-craft/releases/latest");
  assert.equal(githubReleaseEndpoint("https://github.com.evil.example/org/repo"), null);
  assert.equal(githubReleaseEndpoint("https://github.com/org/repo/releases"), null);
});
test("choose x64 Windows installers, excluding signatures and other architectures", () => {
  const assets = [{ name: "app_arm64-setup.exe" }, { name: "app_x64-setup.exe.sig" }, { name: "app_x64-setup.exe" }];
  assert.equal(pickWindowsInstaller(assets), assets[2]);
  assert.equal(pickWindowsInstaller(assets.slice(0, 2)), undefined);
});
