class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.6.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.6.1/crev-darwin-arm64"
      sha256 "bfbbcd2d0046dc4d36959b47e5e0cfc410618cb026be12be0ac8b1674f26d7cb"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.6.1/crev-darwin-x64"
      sha256 "f99bea4b2c91b058d07ead036e106b45d4c2a024d181888fce88683f1c887738"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.6.1/crev-linux-arm64"
      sha256 "8cdb134c88275a3fd5673fb9824c59114a3bf2f596ae5119607eb434e202ecff"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.6.1/crev-linux-x64"
      sha256 "0a0418d368e183a8da6fedad1987bfc4edd256668f9653b839e257b0b284d563"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
