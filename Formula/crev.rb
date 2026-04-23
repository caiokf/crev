class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.6.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.6.2/crev-darwin-arm64"
      sha256 "9fbdf7aa2be66ca0d4df6c3ea5ed9fb0cb79547ecb49fbcd8f51934dff84844a"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.6.2/crev-darwin-x64"
      sha256 "79b78cc7efcf2b597848fb7670434ba96032d539abf9e9d8ca4e3da02306be26"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.6.2/crev-linux-arm64"
      sha256 "e0b331c775c56fe40fd025f77f7a6bbc08a294dfaea33b05fa1e7b7c3864a51f"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.6.2/crev-linux-x64"
      sha256 "0aae4e0a8ab95da571f127273bc4c117802b497b65f19ae5bed3583480a0246b"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
