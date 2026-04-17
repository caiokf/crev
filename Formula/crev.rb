class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.4.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.4.0/crev-darwin-arm64"
      sha256 "af0f2f8e9e490581817331e118097d9fe847ff55a0c86b01aaded4db4e002e90"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.4.0/crev-darwin-x64"
      sha256 "0c8ca1c5419bf66b966f3a029beed3fd0d7701a66ce7fabd7d76e916ea796b02"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.4.0/crev-linux-arm64"
      sha256 "6c522d384dad9cd4f9957332cedd1abac7aaab46533edcd3a2a74186a54b6dc2"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.4.0/crev-linux-x64"
      sha256 "9d9d514a3a5c9e479235d21180239c2c1987fdfdc45f8796e4695bce86eddcdd"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
