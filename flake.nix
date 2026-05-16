{
  description = "npm-fw development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f (
            import nixpkgs {
              inherit system;
              config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [ "codeql" ];
            }
          )
        );
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.pnpm
            pkgs.codeql
          ];

          shellHook = ''
            echo "npm-fw dev shell"
            echo "  node   $(node --version)"
            echo "  pnpm   $(pnpm --version)"
            echo "  codeql $(codeql version 2>/dev/null || echo 'ready')"
          '';
        };
      });
    };
}
