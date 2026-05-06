cmake_minimum_required(VERSION 3.13)
project(script_manager)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_VERBOSE_MAKEFILE ON)

add_library(script_manager SHARED
  ScriptManagerJni.cpp
)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

target_link_libraries(script_manager
  android
  log
  ReactAndroid::jsi
  ReactAndroid::reactnative
  fbjni::fbjni
)
