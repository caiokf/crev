class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.6.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.6.0/crev-darwin-arm64"
      sha256 "914e471c77ef0cf0c97aa09134efdcbdd457549d1dbf7698a3236b9f03fc017d"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.6.0/crev-darwin-x64"
      sha256 "fe73b3266e539016a633b4c639c2aba1ba61dc8a33dd980606db6d6a9569e699"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.6.0/crev-linux-arm64"
      sha256 "1685646c347bbd1c3ed61fb84eba50e1a1713ee041ba16797f0e8aed06b7e83b"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.6.0/crev-linux-x64"
      sha256 "0020138606a7fb2fd4dc0bd7fdd932871e63b56a52f5a103c4d7d4d11665acff"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
