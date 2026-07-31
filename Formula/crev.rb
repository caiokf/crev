class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.11.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.11.0/crev-darwin-arm64"
      sha256 "0c7fd7170401f26c2bf8872c5b0c2d166be8c7375f6b3347a5b6977ec76c4d04"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.11.0/crev-darwin-x64"
      sha256 "0463a7259802dd43a1a4bf667108a52ad626d15325376e463e8eb4d25d506774"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.11.0/crev-linux-arm64"
      sha256 "f82f6917f2069ad62579c6480ee5038052b5493172ee9515fb666606b3d3bfef"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.11.0/crev-linux-x64"
      sha256 "0ee5a4688ea10a78c8a8a05aed84e952e356ecf9a281c21c90574bc4ae1a3241"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
