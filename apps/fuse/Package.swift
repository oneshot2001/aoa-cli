// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AxisFuse",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(path: "../../packages/core-swift")
    ],
    targets: [
        .executableTarget(
            name: "AxisFuse",
            dependencies: [
                .product(name: "AxctlCore", package: "core-swift")
            ],
            linkerSettings: [
                .linkedLibrary("sqlite3")
            ]
        )
    ]
)
